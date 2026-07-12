CREATE TABLE IF NOT EXISTS scraping_jobs (
  job_id UUID PRIMARY KEY,
  url TEXT NOT NULL,
  selector TEXT,
  status VARCHAR(20) DEFAULT 'pending',
  raw_data TEXT,
  error_message TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_scraping_jobs_status ON scraping_jobs(status);
CREATE INDEX IF NOT EXISTS idx_scraping_jobs_created_at ON scraping_jobs(created_at);

CREATE SCHEMA IF NOT EXISTS base;

CREATE TABLE IF NOT EXISTS base.detik_scraping_jobs (
  job_id UUID PRIMARY KEY,
  run_id UUID,
  source_url TEXT NOT NULL,
  page_type VARCHAR(50) NOT NULL,
  category VARCHAR(100) DEFAULT 'all',
  sub_category VARCHAR(100),
  status VARCHAR(20) DEFAULT 'pending',
  articles JSONB,
  article_count INTEGER DEFAULT 0,
  error_message TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

ALTER TABLE base.detik_scraping_jobs ADD COLUMN IF NOT EXISTS run_id UUID;
ALTER TABLE base.detik_scraping_jobs ADD COLUMN IF NOT EXISTS category VARCHAR(100) DEFAULT 'all';
ALTER TABLE base.detik_scraping_jobs ADD COLUMN IF NOT EXISTS sub_category VARCHAR(100);

CREATE INDEX IF NOT EXISTS idx_detik_scraping_jobs_status ON base.detik_scraping_jobs(status);
CREATE INDEX IF NOT EXISTS idx_detik_scraping_jobs_run_id ON base.detik_scraping_jobs(run_id);
CREATE INDEX IF NOT EXISTS idx_detik_scraping_jobs_category ON base.detik_scraping_jobs(category);
CREATE INDEX IF NOT EXISTS idx_detik_scraping_jobs_page_type ON base.detik_scraping_jobs(page_type);
CREATE INDEX IF NOT EXISTS idx_detik_scraping_jobs_created_at ON base.detik_scraping_jobs(created_at);

CREATE TABLE IF NOT EXISTS base.detik_scraping_jobs_details (
  detail_id UUID PRIMARY KEY,
  scraping_job_id UUID NOT NULL REFERENCES base.detik_scraping_jobs(job_id) ON DELETE CASCADE,
  run_id UUID NOT NULL,
  source_url TEXT NOT NULL,
  page_type VARCHAR(50) NOT NULL,
  category VARCHAR(100) NOT NULL,
  sub_category VARCHAR(100),
  article_rank INTEGER,
  title TEXT NOT NULL,
  link TEXT NOT NULL,
  image TEXT,
  article_category VARCHAR(100),
  published_text TEXT,
  raw_article JSONB,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_detik_scraping_jobs_details_job_id ON base.detik_scraping_jobs_details(scraping_job_id);
CREATE INDEX IF NOT EXISTS idx_detik_scraping_jobs_details_run_id ON base.detik_scraping_jobs_details(run_id);
CREATE INDEX IF NOT EXISTS idx_detik_scraping_jobs_details_category ON base.detik_scraping_jobs_details(category, sub_category);
CREATE INDEX IF NOT EXISTS idx_detik_scraping_jobs_details_link ON base.detik_scraping_jobs_details(link);
