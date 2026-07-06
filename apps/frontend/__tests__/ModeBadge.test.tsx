import { render, screen } from "@testing-library/react";
import ModeBadge from "@/components/ModeBadge";

describe("ModeBadge", () => {
  it("renders a metro badge with line name", () => {
    render(<ModeBadge mode="metro" lineName="1" lineColor="#FFCE00" />);

    const badge = screen.getByRole("img", { name: /Métro ligne 1/i });
    expect(badge).toBeInTheDocument();
    expect(badge).toHaveTextContent("1");
  });

  it("falls back to Bus label for unknown modes", () => {
    render(<ModeBadge mode="unknown" showLabel />);

    expect(screen.getByRole("img", { name: /unknown/i })).toBeInTheDocument();
  });

  it("uses walking meta for walking type", () => {
    render(<ModeBadge type="walking" showLabel />);

    const badge = screen.getByRole("img", { name: /Marche/i });
    expect(badge).toBeInTheDocument();
    expect(badge).toHaveTextContent("Marche");
  });
});
