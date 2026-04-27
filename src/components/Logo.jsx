import clsx from "clsx";
import Link from "next/link";

const Logo = ({ invert, href, className, children, ...props }) => {
  className = clsx(
    className,
    "black",
    "transition duration-200 ease-[cubic-bezier(0.34,1.56,0.64,1)] active:scale-[0.88]",
    invert ? "text-white hover:text-accent-400" : "text-black hover:text-accent-400"
  );
  const inner = <span className="relative">{children}</span>;
  if (href) {
    return (
      <Link href={href} className={className} {...props}>
        {inner}
      </Link>
    );
  }
  return (
    <h2
      className={clsx(
        "cursor-pointer text-2xl font-semibold duration-300",
        className
      )}
      {...props}
    >
      {inner}
    </h2>
  );
};

export default Logo;
