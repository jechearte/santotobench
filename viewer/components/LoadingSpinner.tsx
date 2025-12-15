export function LoadingSpinner({ message = "Cargando..." }: { message?: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-12">
      <div className="relative">
        <div className="w-12 h-12 border-4 border-pizarra-200 rounded-full"></div>
        <div className="w-12 h-12 border-4 border-sidra-500 rounded-full border-t-transparent animate-spin absolute top-0 left-0"></div>
      </div>
      <p className="mt-4 text-pizarra-600 font-medium">{message}</p>
    </div>
  );
}





