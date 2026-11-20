import React, { useState } from 'react';

export default function SetupInstructionsModal({ isOpen, onClose }) {
  const [copied, setCopied] = useState('');

  if (!isOpen) return null;

  function handleCopy(text, key) {
    navigator.clipboard.writeText(text);
    setCopied(key);
    setTimeout(() => setCopied(''), 2000);
  }

  const sqlSnippet = `-- Enable UUID extension
create extension if not exists "uuid-ossp";

-- 1. PRODUCTS TABLE
create table if not exists public.products (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  category text not null default 'General',
  price numeric(10, 2) not null check (price >= 0),
  quantity integer not null default 0 check (quantity >= 0),
  unit text not null default 'box',
  low_stock_level integer not null default 10 check (low_stock_level >= 0),
  video_url text,
  qr_code text unique not null,
  created_at timestamptz not null default now()
);

-- 2. BILLS TABLE
create table if not exists public.bills (
  id uuid primary key default gen_random_uuid(),
  bill_number text unique not null,
  customer_name text not null,
  place text,
  bill_date timestamptz not null default now(),
  subtotal numeric(10, 2) not null default 0,
  discount_percent numeric(5, 2) not null default 0,
  discount_amount numeric(10, 2) not null default 0,
  final_total numeric(10, 2) not null default 0,
  created_at timestamptz not null default now()
);

-- 3. BILL ITEMS TABLE
create table if not exists public.bill_items (
  id uuid primary key default gen_random_uuid(),
  bill_id uuid not null references public.bills(id) on delete cascade,
  product_id uuid references public.products(id) on delete set null,
  product_name text not null,
  rate numeric(10, 2) not null check (rate >= 0),
  quantity integer not null check (quantity > 0),
  total numeric(10, 2) not null check (total >= 0)
);

-- 4. REQUESTED ITEMS TABLE
create table if not exists public.requested_items (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  requested_at timestamptz not null default now()
);

-- 5. SETTINGS TABLE
create table if not exists public.settings (
  id integer primary key default 1 check (id = 1),
  total_investment numeric(12, 2) not null default 150000.00,
  pin_hash text not null default '03ac674216f3e15c761ee1a5e255f067953623c8b388b4459e13f978d7c846f4',
  updated_at timestamptz not null default now()
);

-- Ensure settings row exists
insert into public.settings (id, total_investment, pin_hash)
values (1, 150000.00, '03ac674216f3e15c761ee1a5e255f067953623c8b388b4459e13f978d7c846f4')
on conflict (id) do nothing;

-- 6. STORAGE BUCKET FOR DEMO VIDEOS
insert into storage.buckets (id, name, public)
values ('cracker-videos', 'cracker-videos', true)
on conflict (id) do nothing;

-- 7. RLS POLICIES FOR SHARED PIN COUNTER TERMINAL
alter table public.products enable row level security;
alter table public.bills enable row level security;
alter table public.bill_items enable row level security;
alter table public.requested_items enable row level security;
alter table public.settings enable row level security;

create policy "Anon full access products" on public.products for all using (true) with check (true);
create policy "Anon full access bills" on public.bills for all using (true) with check (true);
create policy "Anon full access bill_items" on public.bill_items for all using (true) with check (true);
create policy "Anon full access requested_items" on public.requested_items for all using (true) with check (true);
create policy "Anon full access settings" on public.settings for all using (true) with check (true);

create policy "Public Access Cracker Videos" on storage.objects for select using (bucket_id = 'cracker-videos');
create policy "Allow Upload Cracker Videos" on storage.objects for insert with check (bucket_id = 'cracker-videos');
create policy "Allow Update Cracker Videos" on storage.objects for update using (bucket_id = 'cracker-videos');
create policy "Allow Delete Cracker Videos" on storage.objects for delete using (bucket_id = 'cracker-videos');`;

  return (
    <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="w-full max-w-3xl bg-light-surface-container-lowest border-2 border-gold-border rounded-xl shadow-2xl p-6 flex flex-col gap-5 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between border-b border-light-outline-variant pb-3">
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-deep-green text-[26px]">terminal</span>
            <h2 className="font-headline text-lg md:text-xl font-bold text-light-on-surface">
              Step-by-Step Setup: Supabase, Edge Function & Vercel
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded inline-flex items-center justify-center text-light-on-surface-variant hover:bg-light-surface-container"
          >
            <span className="material-symbols-outlined text-[20px]">close</span>
          </button>
        </div>

        {/* STEP 1: SUPABASE SQL */}
        <section className="flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <h3 className="font-headline text-sm font-bold text-deep-green">
              Step 1: Create Supabase Tables & Storage Bucket
            </h3>
            <button
              type="button"
              onClick={() => handleCopy(sqlSnippet, 'sql')}
              className="px-2.5 py-1 rounded bg-gold-soft border border-gold-border font-label text-xs font-bold text-deep-green hover:bg-gold hover:text-on-gold"
            >
              {copied === 'sql' ? 'Copied SQL!' : 'Copy SQL'}
            </button>
          </div>
          <p className="font-body text-xs text-light-on-surface-variant">
            Go to <a href="https://supabase.com" target="_blank" rel="noreferrer" className="underline text-deep-green font-bold">Supabase Dashboard</a> &gt; <strong>SQL Editor</strong> &gt; Paste and click <strong>Run</strong>.
          </p>
          <pre className="p-3 rounded bg-light-surface-container font-mono text-[11px] max-h-48 overflow-y-auto border border-light-outline-variant">
            {sqlSnippet}
          </pre>
        </section>

        {/* STEP 2: EDGE FUNCTION (GEMINI API) */}
        <section className="flex flex-col gap-2 border-t border-light-outline-variant pt-4">
          <h3 className="font-headline text-sm font-bold text-deep-green">
            Step 2: Deploy Edge Function for Gemini AI List Reading
          </h3>
          <p className="font-body text-xs text-light-on-surface-variant">
            In your terminal, deploy the edge function using Supabase CLI and set your free Gemini API key:
          </p>
          <div className="bg-light-surface-container p-3 rounded font-mono text-xs border border-light-outline-variant flex flex-col gap-1.5">
            <p className="text-light-on-surface-variant font-bold"># 1. Set the Gemini API Key in Supabase Secrets</p>
            <p className="text-deep-green font-bold">supabase secrets set GEMINI_API_KEY=your_gemini_api_key</p>
            <p className="text-light-on-surface-variant font-bold mt-1"># 2. Deploy the parse-stock-list function</p>
            <p className="text-deep-green font-bold">supabase functions deploy parse-stock-list --no-verify-jwt</p>
          </div>
        </section>

        {/* STEP 3: VERCEL DEPLOYMENT */}
        <section className="flex flex-col gap-2 border-t border-light-outline-variant pt-4">
          <h3 className="font-headline text-sm font-bold text-deep-green">
            Step 3: Deploy Frontend on Vercel
          </h3>
          <p className="font-body text-xs text-light-on-surface-variant">
            Push code to GitHub or run <code className="bg-light-surface-container px-1 py-0.5 rounded font-mono">vercel</code>. In Vercel Project Settings &gt; <strong>Environment Variables</strong>, add:
          </p>
          <div className="bg-light-surface-container p-3 rounded font-mono text-xs border border-light-outline-variant">
            <p>VITE_SUPABASE_URL=https://your-project-ref.supabase.co</p>
            <p>VITE_SUPABASE_ANON_KEY=your_supabase_anon_key</p>
          </div>
        </section>

        {/* STEP 4: RLS & SECURITY LIMITS EXPLAINED */}
        <section className="bg-gold-soft border border-gold-border rounded-lg p-3.5 flex flex-col gap-1.5 text-xs">
          <h4 className="font-headline font-bold text-deep-green flex items-center gap-1.5">
            <span className="material-symbols-outlined text-[18px]">security</span>
            <span>Security Model & RLS Limits in Plain Language</span>
          </h4>
          <p className="font-body text-light-on-surface leading-relaxed">
            This internal application is designed for physical shop counters and owner phones without requiring individual user email logins.
            Access is guarded by the <strong>Shared Owner PIN screen</strong> on counter devices, and the PIN hash is stored in Postgres.
          </p>
          <p className="font-body text-light-on-surface leading-relaxed">
            <strong>Row Level Security (RLS):</strong> The tables use anon policies because there are no customer accounts. Since the Supabase anon key is shipped in client code, any person who opens developer tools could inspect the anon key. 
            The <strong>Gemini AI API key is completely protected</strong> inside the Supabase Edge Function environment and is never visible in the browser. For an internal shop tool, this offers the perfect balance of zero-friction counter billing and centralized Postgres storage across all devices!
          </p>
        </section>

        <div className="flex justify-end pt-2">
          <button
            type="button"
            onClick={onClose}
            className="min-h-10 px-5 rounded-md bg-gold text-on-gold font-label text-xs font-bold hover:opacity-90 border border-gold-border"
          >
            Got it
          </button>
        </div>
      </div>
    </div>
  );
}
