import Link from "next/link";

export default function NotFound() {
  return (
    <div className="min-h-[50vh] flex flex-col items-center justify-center text-center">
      <div className="text-8xl mb-6">🔍</div>
      <h1 className="text-3xl font-bold text-pizarra-800 mb-4">
        Run not found
      </h1>
      <p className="text-pizarra-600 mb-8 max-w-md">
        The file you&apos;re looking for doesn&apos;t exist or is not available in the data folder.
      </p>
      <Link
        href="/runs"
        className="inline-flex items-center gap-2 px-6 py-3 bg-sidra-600 text-white font-semibold rounded-xl hover:bg-sidra-700 transition-colors cursor-pointer"
      >
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
        </svg>
        Back to runs
      </Link>
    </div>
  );
}





