import { Handler } from '@netlify/functions';
import { createClient } from '@supabase/supabase-js';

export const handler: Handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  let body;
  try {
    body = JSON.parse(event.body || '{}');
  } catch (parseError) {
    return { statusCode: 400, body: JSON.stringify({ error: 'Invalid JSON body' }) };
  }

  const { jobId, fileName, fileData, contentType } = body;
  if (!jobId || !fileName || !fileData || !contentType) {
    return { statusCode: 400, body: JSON.stringify({ error: 'Missing parameters' }) };
  }

  // Use consistent env var names (update in Netlify if needed)
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !supabaseServiceKey) {
    return { statusCode: 500, body: JSON.stringify({ error: 'Missing Supabase environment variables' }) };
  }

  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  // Add uniqueness to path to avoid overwrites
  const filePath = `fault-photos/${jobId}-${fileName}`;

  let buffer;
  try {
    buffer = Buffer.from(fileData, 'base64');
  } catch (decodeError) {
    return { statusCode: 400, body: JSON.stringify({ error: 'Invalid base64 data' }) };
  }

  const { error: uploadError } = await supabase.storage
    .from('fault-photos')
    .upload(filePath, buffer, { contentType, upsert: false }); // Explicitly no upsert to fail on duplicates

  if (uploadError) {
    console.error('Upload error:', uploadError); // Log for Netlify
    return { statusCode: 500, body: JSON.stringify({ error: uploadError.message }) };
  }

  const { data: urlData } = supabase.storage.from('fault-photos').getPublicUrl(filePath);
  const publicUrl = urlData.publicUrl;

  const { error: updateError, count } = await supabase
    .from('repair_requests')
    .update({ fault_photo_url: publicUrl })
    .eq('id', jobId);

  if (updateError) {
    console.error('Update error:', updateError); // Log for Netlify
    return { statusCode: 500, body: JSON.stringify({ error: updateError.message }) };
  }

  if (count === 0) {
    return { statusCode: 404, body: JSON.stringify({ error: 'No matching jobId found' }) };
  }

  return {
    statusCode: 200,
    body: JSON.stringify({ success: true, photoUrl: publicUrl }),
    headers: { 'Access-Control-Allow-Origin': '*' } // Add CORS if needed for frontend calls
  };
};