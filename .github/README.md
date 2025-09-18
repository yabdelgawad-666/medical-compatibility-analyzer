# Medical Data Analysis Platform

A full-stack web application for analyzing medical data compatibility between medications and ICD-10 diagnosis codes.

## Features

- **Medical Record Upload**: Upload Excel files containing patient medication and diagnosis data
- **Compatibility Analysis**: Automatic analysis based on predefined medical rules and contraindications
- **Dashboard Analytics**: Comprehensive dashboards with detailed compatibility reports
- **Medication Database**: Integration with FDA API for medication information
- **ICD-10 Support**: Full support for ICD-10 diagnosis codes
- **Mismatch Detection**: Identifies potential medication-diagnosis mismatches

## Technology Stack

- **Frontend**: React 18, TypeScript, Tailwind CSS, shadcn/ui
- **Backend**: Express.js, Node.js
- **Database**: PostgreSQL with Drizzle ORM
- **External APIs**: FDA OpenFDA API, NLM ICD-10 API
- **File Processing**: Excel file parsing with XLSX library

## Getting Started

1. Install dependencies:
   ```bash
   npm install
   ```

2. Set up your database and environment variables

3. Push database schema:
   ```bash
   npm run db:push
   ```

4. Start the development server:
   ```bash
   npm run dev
   ```

The application will be available at `http://localhost:5000`.

## Environment Variables

- `DATABASE_URL`: PostgreSQL connection string
- `FDA_API_KEY` (optional): FDA API key for enhanced rate limits

## License

MIT License
