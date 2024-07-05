import axios from 'axios';
import FormData from 'form-data';

export const pinFileToIPFS = async (fileBuffer: Buffer, fileName: string) => {
  const formData = new FormData();
  formData.append('file', fileBuffer, fileName);

  const pinataMetadata = JSON.stringify({
    name: 'Entangled Reptile',
  });
  formData.append('pinataMetadata', pinataMetadata);

  const pinataOptions = JSON.stringify({
    cidVersion: 0,
  });
  formData.append('pinataOptions', pinataOptions);

  try {
    const res = await axios.post("https://api.pinata.cloud/pinning/pinFileToIPFS", formData, {
      maxBodyLength: 10000,
      headers: {
        'Content-Type': `multipart/form-data;`,
        'Authorization': `Bearer ${process.env.PINATA_API_SECRET_KEY}`
      }
    });
    return res.data;
  } catch (error) {
    console.error('Error pinning file to IPFS:', error);
    throw error;
  }
};