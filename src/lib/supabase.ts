import { createClient } from '@supabase/supabase-js';

// Substitua pelas credenciais do seu projeto Supabase
const supabaseUrl = "https://lrrrkholkqakvzdxezyj.supabase.co";
const supabaseAnonKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxycnJraG9sa3Fha3Z6ZHhlenlqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzMxOTYwMzQsImV4cCI6MjA4ODc3MjAzNH0.Q9GIxKTEkTq_-kly_tXJsgaze4Eou0EioR0uVb2AXbY";

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
