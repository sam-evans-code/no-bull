import NoBullApp from "@/app/components/NoBullApp";

export default function Home() {
  return (
    <div className="flex flex-1 flex-col items-center bg-zinc-950">
      <main className="flex w-full max-w-[56rem] flex-1 flex-col gap-6 px-4 py-6 sm:px-6 sm:py-10">
        <NoBullApp />
      </main>
    </div>
  );
}
