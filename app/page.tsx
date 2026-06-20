import NoBullApp from "@/app/components/NoBullApp";

export default function Home() {
  return (
    <div className="flex flex-1 flex-col items-center bg-zinc-950">
      <main className="flex w-full max-w-[63rem] flex-1 flex-col gap-8 px-4 py-8 sm:px-6 sm:py-12">
        <NoBullApp />
      </main>
    </div>
  );
}
