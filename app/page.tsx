import NoBullApp from "@/app/components/NoBullApp";

export default function Home() {
  return (
    <div className="flex flex-1 flex-col items-center bg-zinc-50">
      <header className="w-full max-w-2xl px-6 pt-16 text-center">
        <h1 className="text-4xl font-bold tracking-tight text-black">No Bull</h1>
        <p className="mt-3 text-lg text-zinc-600">
          Stress-test your decisions and ideas against reality, not a yes-man.
        </p>
      </header>

      <main className="flex w-full max-w-2xl flex-1 flex-col gap-8 px-6 py-12">
        <NoBullApp />
      </main>
    </div>
  );
}
