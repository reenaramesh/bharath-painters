/* eslint-disable react/only-export-components */
export function paginate(rows, page, pageSize) {
  const totalPages = Math.max(1, Math.ceil(rows.length / pageSize));
  const safePage = Math.min(page, totalPages);
  return { pageRows: rows.slice((safePage - 1) * pageSize, safePage * pageSize), totalPages, safePage };
}

export default function DirectoryPagination({ total, page, totalPages, pageSize, setPage, setPageSize }) {
  const start = total ? (page - 1) * pageSize + 1 : 0;
  const end = Math.min(page * pageSize, total);
  return <footer className="flex flex-col gap-3 border-t bg-slate-50 px-4 py-3 sm:flex-row sm:items-center sm:justify-between"><p className="text-sm text-slate-500">Showing <b>{start}-{end}</b> of <b>{total}</b> records</p><div className="flex flex-wrap items-center gap-2"><label className="text-sm text-slate-500">Per page <select value={pageSize} onChange={(event) => { setPageSize(Number(event.target.value)); setPage(1); }} className="ml-1 rounded-lg border bg-white px-2 py-1.5 font-semibold text-slate-900">{[25, 50, 75, 100].map((size) => <option key={size}>{size}</option>)}</select></label><button disabled={page <= 1} onClick={() => setPage((value) => value - 1)} className="rounded-lg border bg-white px-3 py-1.5 text-sm font-semibold disabled:opacity-40">Previous</button><span className="min-w-20 text-center text-sm font-semibold">Page {page} of {totalPages}</span><button disabled={page >= totalPages} onClick={() => setPage((value) => value + 1)} className="rounded-lg border bg-white px-3 py-1.5 text-sm font-semibold disabled:opacity-40">Next</button></div></footer>;
}
