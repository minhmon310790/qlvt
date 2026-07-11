import { createClient } from '@supabase/supabase-js';

// Lấy chìa khóa từ file .env
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

// Tạo "cánh cửa" kết nối
export const supabase = createClient(supabaseUrl, supabaseAnonKey);