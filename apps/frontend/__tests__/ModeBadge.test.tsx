import { render, screen } from "@testing-library/react";
import ModeBadge from "@/components/ModeBadge";

describe("ModeBadge", () => {
  it("renders a metro badge with line name and IDFM color", () => {
    render(<ModeBadge mode="metro" lineName="1" />);

    const badge = screen.getByRole("img", { name: /Métro 1/i });
    expect(badge).toBeInTheDocument();
    expect(badge).toHaveTextContent("1");
  });

  it("uses RER icon for RER mode", () => {
    render(<ModeBadge mode="rer" lineName="A" />);

    const badge = screen.getByRole("img", { name: /RER A/i });
    expect(badge).toBeInTheDocument();
  });

  it("uses TramFront icon for tram mode", () => {
    render(<ModeBadge mode="tram" lineName="3a" />);

    const badge = screen.getByRole("img", { name: /Tram 3a/i });
    expect(badge).toBeInTheDocument();
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

  it("uses Bus fallback for unknown modes", () => {
    render(<ModeBadge mode="unknown" />);

    const badge = screen.getByRole("img", { name: /unknown/i });
    expect(badge).toBeInTheDocument();
  });
});
