# Airflow Web Scraping Project

Sistem web scraping terintegrasi dengan Node.js API, Apache Airflow 2.8.4, dan PostgreSQL dalam Docker.

## Arsitektur

```
┌──────────────────────┐
│   Node.js API        │
│   (Scraping Logic)   │
└──────────────────────┘
           ↑
           │ (HTTP Request)
┌──────────────────────┐
│   Apache Airflow     │
│  (Orchestration)     │
└──────────────────────┘
           ↓
┌──────────────────────┐
│  PostgreSQL DB       │
│  (Raw Data Storage)  │
└──────────────────────┘
```

## Komponen

### 1. **Node.js API** (`src/`)
- Express.js server untuk menerima request scraping
- Menggunakan Cheerio untuk parsing HTML
- Axios untuk HTTP requests
- Asynchronous processing dengan job queue system

**Endpoints:**
- `POST /api/scrape` - Trigger scraping job
- `GET /api/scrape/status/:jobId` - Cek status job
- `GET /api/scrape/results/:jobId` - Ambil hasil scraping
- `GET /api/health` - Health check

### 2. **PostgreSQL Database**
- Tabel `scraping_jobs` untuk menyimpan raw data
- Tracking job status (pending, completed, failed)
- Indexing untuk performa query

### 3. **Apache Airflow**
- DAG `scraping_workflow` untuk orchestration
- Trigger API sesuai jadwal
- Monitoring dan error handling

## Quick Start

### 1. Install Dependencies

```bash
npm install
```

### 2. Setup Environment

File `.env` sudah tersedia dengan konfigurasi default.

### 3. Run dengan Docker

```bash
docker-compose up -d
```

Tunggu hingga semua service sehat (~2 menit).

### 4. Akses Services

- **API**: http://localhost:3000
- **Airflow UI**: http://localhost:8080 (admin/admin)
- **PostgreSQL**: localhost:5432

## Testing API

### 1. Trigger Scraping Job

```bash
curl -X POST http://localhost:3000/api/scrape \
  -H "x-api-key: change_this_api_key" \
  -H "Content-Type: application/json" \
  -d '{
    "url": "https://example.com",
    "selector": "body"
  }'
```

Response:
```json
{
  "jobId": "uuid-here",
  "message": "Scraping job initiated",
  "status": "pending",
  "url": "https://example.com"
}
```

### 2. Check Job Status

```bash
curl http://localhost:3000/api/scrape/status/{jobId} \
  -H "x-api-key: change_this_api_key"
```

### 3. Get Results

```bash
curl http://localhost:3000/api/scrape/results/{jobId} \
  -H "x-api-key: change_this_api_key"
```

### 4. Health Check

```bash
curl http://localhost:3000/api/health
```

## Struktur Project

```
project-airflow-scraping/
├── src/
│   ├── index.js              # Entry point
│   ├── app.js                # Express app config
│   ├── config/
│   │   └── database.js       # Database config
│   ├── controllers/
│   │   └── scraping.js       # Business logic
│   ├── routes/
│   │   ├── scraping.js       # Scraping endpoints
│   │   └── health.js         # Health check endpoint
│   ├── middleware/           # Custom middleware
│   └── utils/
│       └── db.js             # Database pool
├── airflow/
│   └── dags/
│       └── scraping_workflow.py  # Main DAG
├── database/
│   └── init.sql              # Schema initialization
├── docker-compose.yml        # Docker orchestration
├── Dockerfile                # API image
├── package.json              # Dependencies
└── .env                       # Environment variables
```

## Development

### Mode Development dengan Hot Reload

```bash
npm run dev
```

### Running Tests

```bash
npm test
```

## Database

### Connect ke PostgreSQL

```bash
psql -h localhost -U scraper -d scraping_db
```

### Query Data

```sql
SELECT * FROM scraping_jobs;
SELECT * FROM scraping_jobs WHERE status = 'completed';
```

## Troubleshooting

### API gagal connect ke database

1. Verifikasi container running: `docker-compose ps`
2. Check DB logs: `docker-compose logs postgres`
3. Verifikasi environment variables di `.env`

### Airflow DAG tidak terlihat

1. Refresh Airflow UI (F5)
2. Check Airflow logs: `docker-compose logs airflow`
3. Verifikasi syntax Python file

### Container tidak mau start

```bash
docker-compose down -v  # Remove volumes
docker-compose up -d    # Restart
```

## Next Steps

1. Customize `src/controllers/scraping.js` dengan scraping logic Anda
2. Modify Airflow DAG di `airflow/dags/scraping_workflow.py` sesuai kebutuhan
3. Update database schema di `database/init.sql` jika diperlukan
4. Add error handling dan retry logic sesuai requirement

## Notes

- Raw data disimpan dalam format text di PostgreSQL
- Untuk production, tambahkan validation, rate limiting, dan security measures
- Consider menggunakan message queue (Redis/RabbitMQ) untuk job queue yang lebih robust

---

Pertanyaan? Check logs atau modify sesuai kebutuhan Anda!
