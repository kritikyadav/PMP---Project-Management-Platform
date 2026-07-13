import { useState } from 'react';

export const PAGE_SIZE_OPTIONS = [10, 25, 50, 100] as const;

export function usePagination<T>(items: T[]) {
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);

  const totalPages = Math.max(1, Math.ceil(items.length / pageSize));
  const safePage = Math.min(page, totalPages);
  const start = (safePage - 1) * pageSize;
  const paginated = items.slice(start, start + pageSize);

  function handlePageSizeChange(size: number) {
    setPageSize(size);
    setPage(1);
  }

  return {
    page: safePage,
    setPage,
    pageSize,
    handlePageSizeChange,
    totalPages,
    paginated,
    totalItems: items.length,
  };
}
