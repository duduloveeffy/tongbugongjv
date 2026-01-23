# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is an ERP Inventory Analysis System built with Next.js 15 and React 19 that integrates with WooCommerce for inventory management, sales analysis, and product synchronization. The application supports CSV/Excel file processing, multi-warehouse inventory analysis, **multi-site WooCommerce data synchronization with Supabase**, and real-time sales detection from local database.

## Development Commands

```bash
# Development
npm run dev              # Start development server with Turbo
npm run build           # Build for production
npm run start           # Start production server
npm run preview         # Build and start production server

# Code Quality
npm run check           # Run Biome linter and formatter
npm run check:write     # Run Biome with auto-fix
npm run check:unsafe    # Run Biome with unsafe auto-fixes
npm run typecheck       # Run TypeScript type checking
```

## Architecture Overview

### Core Application Structure
- **Main Page**: `src/app/page.tsx` - Tab-based interface with three main modules
- **State Management**: Zustand store (`src/store/woocommerce.ts`) with persistence
- **API Layer**: Next.js API routes for WooCommerce integration
- **Component Architecture**: Modular components organized by feature

### Key Modules

**1. Inventory Analysis** (`src/components/inventory/`)
- File upload with CSV/Excel parsing (supports GB2312 encoding)
- Multi-warehouse data merging and filtering
- Real-time inventory calculations and predictions
- Transit order management

**2. Sales Detection** (`src/components/sales/`)
- **NEW**: Database-driven sales analysis with multi-site support
- **NEW**: Queries local Supabase database instead of WooCommerce APIs
- Batch processing (50+ SKUs per batch) with instant responses
- 30-day sales comparisons and trend analysis across multiple sites
- **NEW**: Optimized API endpoint: `/api/sales/query` (replaces `/api/wc-sales-analysis`)
- **NEW**: Multi-site data aggregation and real-time sync status monitoring

**3. Inventory Synchronization** (`src/components/sync/`)
- **NEW**: Multi-site WooCommerce data synchronization system
- **NEW**: Complete order and product data storage in Supabase
- **NEW**: Incremental sync with checkpoint tracking
- **NEW**: Automated scheduled sync tasks
- **NEW**: Comprehensive sync monitoring and logging
- **NEW**: 低库存产品（净库存1-10）下拉菜单同步选项：同步数量/同步为无货/同步为有货
- Product detection and stock status synchronization
- Support for both simple and variant products
- Intelligent sync recommendations based on stock levels
- Batch and individual product sync operations

**4. Multi-Site Management** (`src/components/sites/`)
- **NEW**: WooCommerce site configuration and management
- **NEW**: API credential secure storage and testing
- **NEW**: Site-specific sync controls and status monitoring
- **NEW**: Initial and incremental sync operations

### Performance Architecture

**Sales Detection Optimization**:
- Backend computation with Map-based indexing (O(N) vs O(N²))
- Concurrent batch processing with anti-rate-limiting delays
- Frontend React optimizations (useMemo, useCallback)
- Real-time progress tracking with visual progress bars

**Data Flow**:
`inventoryData` → `processedInventoryData` (useMemo) → `filteredInventoryData` (useMemo) → `filteredData` (useState)

## WooCommerce Integration

### API Configuration
- Environment variables: `NEXT_PUBLIC_WOOCOMMERCE_*` (optional)
- Runtime configuration via UI settings (persisted in localStorage)
- Type-safe environment validation using `@t3-oss/env-nextjs`

### API Endpoints
- `/api/wc-orders` - Order fetching with pagination and filtering
- `/api/wc-products` - Product detection and information retrieval
- `/api/wc-sales-analysis` - Optimized sales analysis (batch processing)
- `/api/wc-update-stock` - Product stock status synchronization

### Security Model
- No hardcoded API keys in code
- User-provided credentials stored in localStorage via Zustand
- Optional environment variable fallbacks for development

## Data Processing

### File Formats Supported
- **CSV**: GB2312 encoding support using `iconv-lite`
- **Excel**: Full XLSX support with auto-detection
- **Transit Orders**: Excel with specific column mapping (产品型号, 产品英文名称, 数量)

### Key Calculations
- **Net Sellable Stock**: `可售库存减去缺货占用库存`
- **Transit Stock**: `Net Stock + Transit Quantity`
- **Predicted Transit Quantity**: `Transit Stock - 30-day Sales`

## Code Quality Standards

### TypeScript Configuration
- Strict mode enabled
- No implicit any types
- Comprehensive interface definitions in `src/lib/inventory-utils.ts`

### Linting and Formatting
- Biome for code formatting and linting
- ESLint-style rules with auto-fixing capabilities
- Consistent import organization and code style

### Component Patterns
- Function components with hooks
- Memoization for performance-critical components
- Proper TypeScript prop interfaces
- Error boundaries for robust error handling

## Development Guidelines

### UI Components
- shadcn/ui component library (pre-installed)
- Lucide React icons
- Tailwind CSS for styling
- Sonner for toast notifications

### State Management
- Zustand with persistence middleware
- Separate stores for different concerns
- Immutable state updates
- Local storage integration

### Error Handling
- User-friendly error messages in Chinese
- Comprehensive API error handling
- Timeout management for external requests
- Progress tracking for long-running operations

## Performance Considerations

### Large Dataset Handling
- Virtual scrolling for large tables (when needed)
- Batch processing for API requests
- Memory-efficient data structures (Map/Set for lookups)
- Debounced filtering and search

### WooCommerce API Optimization
- Pagination with 100 items per page
- Field selection to minimize payload
- Request queuing to prevent rate limiting
- Intelligent retry mechanisms

## Deployment Notes

- Next.js static generation where possible
- Environment variable validation at build time
- Production-ready error handling
- Optimized bundle size with dynamic imports

## Important Files to Reference

- `src/lib/inventory-utils.ts` - Core data processing utilities
- `src/store/woocommerce.ts` - State management and API integration
- `src/env.js` - Environment variable configuration
- `OPTIMIZATION_SUMMARY.md` - Detailed performance optimization documentation
- Documentation in `/docs/` folder for specific features