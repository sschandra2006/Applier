export const generateWorkflow = async (url) => {
  const token = localStorage.getItem('token');
  const res = await fetch('http://localhost:5000/api/v1/workflows/generate', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    },
    body: JSON.stringify({ url })
  });
  
  const data = await res.json();
  if (!data.success) throw new Error(data.message);
  return data.data;
};
