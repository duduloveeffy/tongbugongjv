'use client';

import { Navigation } from './Navigation';

interface PageLayoutProps {
  children: React.ReactNode;
  title?: string;
  description?: string;
}

export function PageLayout({ children, title, description }: PageLayoutProps) {
  return (
    <div className="min-h-screen bg-background">
      <Navigation />
      <main className="container mx-auto px-4 py-6">
        {(title || description) && (
          <div className="mb-6">
            {title && <h1 className="text-3xl font-bold">{title}</h1>}
            {description && (
              <p className="mt-2 text-muted-foreground">{description}</p>
            )}
          </div>
        )}
        {children}
      </main>
    </div>
  );
}