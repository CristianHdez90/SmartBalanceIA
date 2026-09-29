import ExcelJS from 'exceljs';
import { columns, tables, toLedger, type MonthBackup } from '../domain/month-backup';
import { dateForDay, paidFor, totals } from '../domain/finance';
import { paymentReport } from '../domain/payment-report';

const labels:Record<string,string>={id:'ID',month:'Mes',name:'Obligación',category:'Categoría',amount:'Valor (COP)',note:'Nota',cutoff_date:'Fecha de corte',due_date:'Fecha límite',series_id:'ID serie',cutoff_day:'Día de corte',due_day:'Día límite',total_debt:'Deuda total (COP)',bank:'Banco',banking_url:'Enlace bancario',interest_mv:'Interés M.V.',interest_ea:'Interés E.A.',recurring_amount:'Cuota recurrente (COP)',kind:'Tipo de movimiento',obligation_id:'ID obligación',date:'Fecha real',description:'Descripción',from_month:'Mes origen',to_month:'Mes destino',created_at:'Fecha de traslado (UTC)',source_id:'ID obligación origen',target_id:'ID obligación destino',reason:'Motivo',from_status:'Estado anterior',to_status:'Estado nuevo',effective_date:'Fecha efectiva',recorded_at:'Fecha de registro (UTC)',cause:'Causa',basis:'Datos del estado',base_amount:'Cuota base (COP)',transferred:'Saldo trasladado (COP)',paid:'Pagado (COP)',pending:'Saldo pendiente (COP)',result:'Resultado de pago'};
const names={obligations:'Obligaciones',movements:'Movimientos',daily_expenses:'Gastos diarios',balance_transfers:'Traslados',obligation_carries:'Obligaciones trasladadas',obligation_history:'Historial de estados'};
type Row=Record<string,string|number|null>;
function sections(b:MonthBackup){
 const ledger=toLedger(b);const today=new Intl.DateTimeFormat('en-CA',{timeZone:'America/Bogota',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(b.exportedAt));
 return tables.filter(table=>b.scope!=='expenses'||table==='daily_expenses').map(table=>({name:names[table],keys:[...columns[table].filter(k=>k!=='user_id'),...(table==='obligations'?['base_amount','paid','transferred','pending','result']:[])],rows:(b[table]??[]).map((raw):Row=>{
  const row:Row={...raw};
  if(table==='obligations'){
   const o=b.obligations.find(o=>o.id===raw.id)!;const paid=paidFor(o.id,ledger.movements);
   const derived=ledger.obligations.find(item=>item.id===o.id)!;row.base_amount=o.amount;row.amount=derived.amount;row.transferred=derived.transferredAmount??0;row.paid=paid;row.pending=derived.amount===null?null:Math.max(0,derived.amount-paid-(derived.transferredAmount??0));
   row.cutoff_date=o.cutoff_day===null?o.cutoff_date:dateForDay(b.month,o.cutoff_day);
   row.due_date=o.due_day===null?o.due_date:dateForDay(b.month,o.due_day);
   row.result=paymentReport({...ledger.obligations.find(item=>item.id===o.id)!,dueDate:row.due_date as string|null},ledger.movements,today).status;
  }
  if('recorded_at' in row)row.recorded_at=new Date(Number(row.recorded_at)).toISOString();
  if('created_at' in row)row.created_at=new Date(Number(row.created_at)).toISOString();
  return row;
 })}));
}
export function exportCsv(b:MonthBackup){
 const groups=sections(b);const keys=[...new Set(groups.flatMap(s=>s.keys))];
 const cell=(value:unknown)=>{let text=value==null?'':String(value);if(typeof value==='string'&&/^[\s]*[=+\-@\t\r\n]/.test(value))text="'"+text;return '"'+text.replaceAll('"','""')+'"';};
 return '\uFEFF'+[['Tipo de registro',...keys.map(k=>labels[k]??k)].map(cell).join(','),...groups.flatMap(group=>group.rows.map(row=>[group.name,...keys.map(k=>row[k])].map(cell).join(',')))].join('\r\n')+'\r\n';
}
export async function exportExcel(b:MonthBackup){
 const workbook=new ExcelJS.Workbook();workbook.creator='Mi Balance';workbook.created=new Date(b.exportedAt);workbook.title='Respaldo mensual '+b.month;
 const summary=workbook.addWorksheet('Resumen',{views:[{showGridLines:false}]});summary.columns=[{width:42},{width:38}];
 summary.addRows([['Mi Balance · Resumen mensual',b.month],['Exportado (UTC)',new Date(b.exportedAt)],['Fuente','Registros de tu cuenta en Mi Balance'],['Importes','Pesos colombianos (COP)'],['Restauración','Utiliza el respaldo .sql para recuperar el mes']]);
 summary.getRow(5).height=35;summary.getRow(5).alignment={wrapText:true,vertical:'middle'};summary.getCell('B2').numFmt='dd/mm/yyyy hh:mm';summary.addRow([]);
 const sums=totals(toLedger(b));
 for(const [label,value] of [['Ingresos recibidos',sums.income],['Saldo recibido de otro mes',sums.incoming],['Total pagado',sums.paid],['Gastos diarios',sums.dailyExpenses],['Saldo trasladado al siguiente mes',sums.outgoing],['Disponible del mes',sums.available],['Total de obligaciones definido',sums.committed],['Saldo pendiente',sums.pending]] as const){const row=summary.addRow([label,value]);row.getCell(2).numFmt='"$" #,##0';}
 summary.addRow(['Valores de obligaciones por definir',b.obligations.filter(o=>o.amount===null).length]);
 for(const group of sections(b)){
  const sheet=workbook.addWorksheet(group.name,{views:[{state:'frozen',ySplit:1,showGridLines:false}]});
  sheet.columns=group.keys.map(key=>({header:labels[key]??key,key,width:['name','description','note','banking_url'].includes(key)?42:key==='result'?25:key.includes('id')?38:23}));
  for(const row of group.rows){const record:Record<string,string|number|Date|null>={};for(const key of group.keys){const value=row[key];record[key]=value;if(value!==null&&typeof value==='string'&&['date','cutoff_date','due_date','effective_date','recorded_at','created_at'].includes(key))record[key]=new Date(value.length===10?value+'T00:00:00Z':value);if(typeof value==='number'&&['interest_mv','interest_ea'].includes(key))record[key]=value/100;}const excelRow=sheet.addRow(record);excelRow.height=32;excelRow.alignment={vertical:'middle',wrapText:true};}
  for(const key of group.keys){const col=sheet.getColumn(key);if(['amount','total_debt','recurring_amount','paid','pending','base_amount','transferred'].includes(key))col.numFmt='"$" #,##0';else if(['interest_mv','interest_ea'].includes(key))col.numFmt='0.00%';else if(['date','cutoff_date','due_date','effective_date'].includes(key))col.numFmt='dd/mm/yyyy';else if(['created_at','recorded_at'].includes(key))col.numFmt='dd/mm/yyyy hh:mm';}
  sheet.autoFilter={from:{row:1,column:1},to:{row:1,column:group.keys.length}};
 }
 workbook.eachSheet(sheet=>{sheet.getRow(1).height=32;sheet.getRow(1).eachCell(cell=>{cell.fill={type:'pattern',pattern:'solid',fgColor:{argb:'FF252B50'}};cell.font={name:'Calibri',bold:true,color:{argb:'FFFFFFFF'},size:11};cell.alignment={vertical:'middle',wrapText:true};});sheet.eachRow((row,i)=>{if(i>1)row.eachCell(cell=>{cell.font={name:'Calibri',size:11};});});});
 return new Uint8Array(await workbook.xlsx.writeBuffer());
}
