// Build page images locally; extracted OCR text is not used for AI extraction.
function imageData(canvas) { return canvas.toDataURL('image/png').split(',')[1]; }
export async function prepareImages(file,kind) {
 if(!['PNG','JPG'].includes(kind))throw new Error('Only JPG and PNG images are supported.');
 {
  const bitmap=await createImageBitmap(file);
  try {
   const scale=Math.min(2,1800/Math.max(bitmap.width,bitmap.height));
   const canvas=document.createElement('canvas');canvas.width=Math.ceil(bitmap.width*scale);canvas.height=Math.ceil(bitmap.height*scale);
   const ctx=canvas.getContext('2d');ctx.fillStyle='white';ctx.fillRect(0,0,canvas.width,canvas.height);ctx.drawImage(bitmap,0,0,canvas.width,canvas.height);
   return [imageData(canvas)];
  }finally {bitmap.close();}
 }
}
