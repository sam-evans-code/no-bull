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
        <section className="flex flex-col gap-3">
          <label htmlFor="idea" className="text-sm font-medium text-zinc-700">
            What idea or decision do you want stress-tested?
          </label>
          <textarea
            id="idea"
            rows={5}
            disabled
            placeholder="e.g. We should raise prices by 20% next quarter."
            className="w-full resize-none rounded-md border border-zinc-300 bg-white p-4 text-base text-zinc-900 placeholder:text-zinc-400 disabled:cursor-not-allowed disabled:bg-zinc-100"
          />
          <button
            type="button"
            disabled
            className="self-start rounded-md bg-black px-5 py-2.5 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-40"
          >
            Stress-test it
          </button>
        </section>

        <section
          aria-label="Results"
          className="flex min-h-[200px] flex-col items-center justify-center rounded-md border border-dashed border-zinc-300 bg-white text-sm text-zinc-400"
        >
          Results will appear here.
        </section>
      </main>
    </div>
  );
}
