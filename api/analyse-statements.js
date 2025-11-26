{queryAnswer && (
  <div className="mt-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-[11px] text-slate-700">
    <div className="flex items-center justify-between gap-2 mb-1">
      <div className="font-medium">AI answer</div>
      {queryMeta && queryMeta.confidence != null && (
        <div className="text-[10px] text-slate-500">
          Confidence:{" "}
          <span className="font-semibold">
            {Math.round(queryMeta.confidence * 100)}%
          </span>
          {queryMeta.confidenceReason && (
            <span className="ml-1">
              – {queryMeta.confidenceReason}
            </span>
          )}
        </div>
      )}
    </div>
    <div className="whitespace-pre-wrap">{queryAnswer}</div>
  </div>
)}
