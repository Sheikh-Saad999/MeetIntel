import { createClient } from "@supabase/supabase-js";

// Set in Vercel (Settings -> Environment Variables):
//   VITE_SUPABASE_URL       the project URL
//   VITE_SUPABASE_ANON_KEY  the publishable (anon) key. This key is meant to be public;
//                           what protects the data is Row Level Security in the database.
// Never put the service_role / secret key in the browser.
const url = import.meta.env.VITE_SUPABASE_URL;
const key = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const supabaseConfigured = Boolean(url && key);
export const supabase = supabaseConfigured ? createClient(url, key) : null;

export const LOGO_BUCKET = "logos";
export const MAX_LOGO_BYTES = 1024 * 1024;
export const LOGO_TYPES = ["image/png", "image/jpeg", "image/webp"];

// Uploads a logo into the organization's own folder and returns its public URL.
export async function uploadLogo(orgId, file) {
  const ext = file.type === "image/png" ? "png" : file.type === "image/webp" ? "webp" : "jpg";
  const path = `${orgId}/logo-${Date.now()}.${ext}`;
  const { error } = await supabase.storage.from(LOGO_BUCKET).upload(path, file, { contentType: file.type, upsert: true });
  if (error) throw new Error("The logo could not be uploaded. " + error.message);
  return supabase.storage.from(LOGO_BUCKET).getPublicUrl(path).data.publicUrl;
}

export function checkLogo(file) {
  if (!file) return "";
  if (!LOGO_TYPES.includes(file.type)) return "Please choose a PNG, JPG or WebP image.";
  if (file.size > MAX_LOGO_BYTES) return "The logo must be 1 MB or smaller.";
  return "";
}
