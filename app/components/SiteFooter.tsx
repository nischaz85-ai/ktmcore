import KTMCoreLogo from "./KTMCoreLogo";

export default function SiteFooter() {
  return (
    <footer className="border-t border-[#d7e1df] bg-[#e9f4f1] px-6 py-12 text-sm text-[#5c7284]">
      <div className="mx-auto flex max-w-7xl flex-col gap-8 sm:flex-row sm:items-end sm:justify-between">
        <KTMCoreLogo showTagline className="h-[112px] w-[330px] max-w-full text-[#17324d]" />
        <p className="pb-1 text-center sm:text-right">
          &copy; {new Date().getFullYear()} KTMCore. All rights reserved.
        </p>
      </div>
    </footer>
  );
}
