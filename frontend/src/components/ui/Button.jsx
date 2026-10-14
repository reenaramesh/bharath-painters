import { LoaderCircle } from "lucide-react";

const variants = {
  primary: "bp-button-primary",
  secondary: "bp-button-secondary",
  quiet: "bp-button-quiet",
  danger: "bp-button-danger",
  ghost: "bp-button-ghost",
};

const sizes = {
  sm: "bp-button-sm",
  md: "bp-button-md",
  lg: "bp-button-lg",
};

export function Button({
  children,
  variant = "primary",
  size = "md",
  type = "button",
  loading = false,
  disabled = false,
  className = "",
  ...props
}) {
  const variantClass = variants[variant] || variants.primary;
  const sizeClass = sizes[size] || sizes.md;
  return (
    <button
      {...props}
      type={type}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={`bp-button ${variantClass} ${sizeClass} ${className}`.trim()}
    >
      {loading && <LoaderCircle className="bp-button-spinner" aria-hidden="true" />}
      {children}
    </button>
  );
}