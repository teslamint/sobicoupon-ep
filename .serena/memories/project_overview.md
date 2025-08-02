# SobiCoupon Project Overview

## Purpose
은평구 민생회복 소비쿠폰을 사용할 수 있는 가맹점의 위치를 카카오맵 API로 검색하고 지도에 표시하는 웹 애플리케이션

## Tech Stack
- **Frontend**: ES6 modules, Kakao Maps API, IndexedDB for caching
- **Backend**: Cloudflare Workers (serverless)
- **Data Processing**: XLSX.js for Excel parsing
- **Testing**: Jest with jsdom environment
- **Linting**: ESLint with custom rules
- **Formatting**: Prettier
- **Build Tool**: Wrangler (Cloudflare Workers CLI)

## Key Features
- Excel file upload and automatic parsing
- Real-time location search and filtering
- Marker clustering and grouping
- Mobile responsive design
- Offline caching system using IndexedDB
- Category and keyword filtering
- Map-based search within current view

## Project Structure
- `/public/` - Frontend assets and main application
- `/public/modules/` - ES6 modules organized by functionality
- `/src/` - Cloudflare Workers backend code
- `/tests/` - Jest test files with coverage reporting