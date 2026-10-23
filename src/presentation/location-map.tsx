'use client';
import {useEffect,useRef,useState} from 'react';
import type {Map as LeafletMap,Marker,Circle,LatLngExpression,LeafletMouseEvent} from 'leaflet';
import 'leaflet/dist/leaflet.css';
type Point={latitude:number;longitude:number};
export default function LocationMap({point,radiusKm,onPick}:{point:Point|null;radiusKm:number;onPick:(point:Point)=>void}){
 const container=useRef<HTMLDivElement>(null),map=useRef<LeafletMap|null>(null),marker=useRef<Marker|null>(null),circle=useRef<Circle|null>(null);
 const latest=useRef({point,radiusKm,onPick});
 const [ready,setReady]=useState(false),[error,setError]=useState('');
 useEffect(()=>{latest.current={point,radiusKm,onPick};},[point,radiusKm,onPick]);
 useEffect(()=>{
  let cancelled=false;let observer:ResizeObserver|undefined;
  import('leaflet').then(L=>{
   if(cancelled||!container.current)return;
   const p=latest.current.point;const center:LatLngExpression=p?[p.latitude,p.longitude]:[4.5709,-74.2973];
   const instance=L.map(container.current,{scrollWheelZoom:false}).setView(center,p?15:5);map.current=instance;
   L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:19,attribution:'&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'}).on('tileerror',()=>{if(!cancelled)setError('No se pudo cargar parte del mapa. Revisa tu conexión o introduce las coordenadas.');}).addTo(instance);
   const pin=L.marker(center,{draggable:true,autoPan:true,title:'Ubicación seleccionada: arrastra para corregir',icon:L.divIcon({className:'location-map-pin',html:'<span></span>',iconSize:[26,26],iconAnchor:[13,13]})});marker.current=pin;
   const area=L.circle(center,{radius:latest.current.radiusKm*1000,color:'#6366f1',fillOpacity:.1,weight:2});circle.current=area;
   if(p){pin.addTo(instance);area.addTo(instance);}
   instance.on('click',(event:LeafletMouseEvent)=>{const pos=event.latlng.wrap();latest.current.onPick({latitude:pos.lat,longitude:pos.lng});});
   pin.on('dragend',()=>{const pos=pin.getLatLng().wrap();latest.current.onPick({latitude:pos.lat,longitude:pos.lng});});
   observer=new ResizeObserver(()=>instance.invalidateSize());observer.observe(container.current);
   setReady(true);
  }).catch(()=>{if(!cancelled)setError('No se pudo abrir el mapa. Puedes introducir las coordenadas.');});
  return()=>{cancelled=true;observer?.disconnect();map.current?.remove();map.current=null;};
 },[]);
 useEffect(()=>{
  if(!ready||!map.current||!marker.current||!circle.current)return;
  if(!point){marker.current.remove();circle.current.remove();return;}
  const center:[number,number]=[point.latitude,point.longitude];
  marker.current.setLatLng(center).addTo(map.current);circle.current.setLatLng(center).setRadius(radiusKm*1000).addTo(map.current);
  if(!map.current.getBounds().contains(center))map.current.setView(center,15);
 },[point,radiusKm,ready]);
 return <div><div ref={container} className="location-leaflet-map" role="region" aria-label="Mapa para seleccionar la ubicación"/>{!ready&&!error&&<p role="status">Cargando mapa…</p>}{error&&<p role="status">{error}</p>}</div>;
}
