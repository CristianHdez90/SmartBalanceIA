const fs=require('fs');
module.exports=({config})=>{
 const googleServicesFile=process.env.GOOGLE_SERVICES_JSON||(fs.existsSync('./google-services.json')?'./google-services.json':undefined);
 return {...config,android:{...config.android,...(googleServicesFile?{googleServicesFile}:{})}};
};
