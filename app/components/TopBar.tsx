import Image from "next/image";
import logo from "@/app/no-bull-logo.png";

export default function TopBar() {
  return (
    <header className="w-full border-b border-zinc-800">
      <div className="mx-auto flex w-full max-w-2xl items-center gap-2 px-4 py-3 sm:px-6">
        <Image src={logo} alt="" width={28} height={28} className="h-7 w-7" priority />
        <span className="font-mono text-sm font-semibold uppercase tracking-widest text-zinc-100">
          No Bull
        </span>
      </div>
    </header>
  );
}
