# Medical Data Analysis Platform

## Overview

This is a full-stack web application for analyzing medical data compatibility between medications and ICD-10 diagnosis codes. The platform allows healthcare professionals to upload Excel files containing patient medication and diagnosis data, then automatically analyzes compatibility based on predefined medical rules and contraindications. The system provides comprehensive dashboards, detailed compatibility reports, and identifies potential medication-diagnosis mismatches that require review.

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend Architecture
The client-side is built with **React 18** using **TypeScript** for type safety. The application uses **Wouter** for lightweight client-side routing and **TanStack Query** for efficient server state management and data fetching. The UI is constructed with **shadcn/ui** components built on top of **Radix UI** primitives, styled with **Tailwind CSS** using CSS variables for theming support.

Key architectural decisions:
- **Component-based architecture**: Modular UI components organized by feature (dashboard, upload, layout)
- **Custom hooks**: Centralized logic for mobile detection, toast notifications, and form handling
- **Query-based state management**: Server state handled by TanStack Query with automatic caching and synchronization
- **Type-safe data flow**: Full TypeScript coverage with shared schema types between client and server

### Backend Architecture
The server is built with **Express.js** and **TypeScript**, following a REST API architecture pattern. The application uses **Drizzle ORM** with **PostgreSQL** for data persistence and type-safe database operations. File uploads are handled with **Multer** for processing Excel files, which are then parsed using **XLSX** library.

Key architectural decisions:
- **Layered architecture**: Separation of routes, storage layer, and business logic
- **In-memory storage adapter**: Abstracted storage interface with initial memory implementation, easily replaceable with database persistence
- **Type-safe API contracts**: Shared schema validation using Zod for runtime type checking
- **Modular route handling**: Clean separation of API endpoints with centralized error handling

### Data Storage Solutions
The application uses **PostgreSQL** as the primary database with **Drizzle ORM** for type-safe queries and migrations. The schema includes tables for medical records, analysis results, ICD-10 codes, and medication data. Database operations are abstracted through a storage interface pattern, allowing for easy testing and potential database switching.

Database design rationale:
- **Normalized schema**: Separate tables for different entity types with proper relationships
- **Flexible JSON fields**: Contraindications and compatibility data stored as JSONB for complex medical rule storage
- **Audit trail**: Timestamp fields for tracking record creation and analysis history
- **Scalable indexing**: Primary keys and foreign key relationships optimized for query performance

### Authentication and Authorization
Currently, the application operates without authentication mechanisms, suggesting it's designed for internal medical professional use within secured networks. User interface includes placeholder avatar components indicating future authentication integration capability.

### External Dependencies

#### Database Integration
- **@neondatabase/serverless**: PostgreSQL database connection optimized for serverless deployments
- **Drizzle ORM**: Type-safe database operations with automatic migration support
- **connect-pg-simple**: Session storage integration for future authentication needs

#### File Processing
- **Multer**: Multipart form data handling for Excel file uploads
- **XLSX**: Excel file parsing and data extraction from medical spreadsheets
- **File validation**: 10MB size limits and format validation for medical data files

#### UI Framework & Styling
- **Radix UI**: Comprehensive component primitives for accessible UI elements
- **Tailwind CSS**: Utility-first CSS framework with custom medical application theming
- **Recharts**: Data visualization library for compatibility charts and medical analytics
- **Lucide React**: Icon system optimized for medical and healthcare applications

#### Development & Build Tools
- **Vite**: Modern build tool with React plugin for fast development and optimized production builds
- **TypeScript**: Full type safety across the entire application stack
- **ESBuild**: Fast TypeScript compilation for server-side code bundling
- **PostCSS**: CSS processing pipeline for Tailwind CSS optimization

The architecture prioritizes medical data accuracy, type safety, and scalable analysis of medication-diagnosis compatibility while maintaining a clean separation of concerns suitable for healthcare applications.