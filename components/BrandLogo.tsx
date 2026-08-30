import Image from "next/image";

const sizes = {
  sm: { mark: 24, classes: "gap-1.5 text-sm" },
  md: { mark: 32, classes: "gap-2 text-xl" },
  lg: { mark: 48, classes: "gap-3 text-4xl" },
};

/** Decorative OP monogram beside one readable, consistently styled brand name. */
export default function BrandLogo({ size = "md" }: { size?: keyof typeof sizes }) {
  const { mark, classes } = sizes[size];
  return (
    <span className={`inline-flex items-center font-display font-semibold tracking-tight text-ink ${classes}`}>
      <Image src="/ourpool-mark.svg" alt="" width={mark} height={mark} className="shrink-0" />
      <span>Our<span className="text-mint">Pool</span></span>
    </span>
  );
}
