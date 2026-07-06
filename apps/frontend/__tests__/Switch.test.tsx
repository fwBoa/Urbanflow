import { render, screen, fireEvent } from "@testing-library/react";
import Switch from "@/components/Switch";

describe("Switch", () => {
  it("renders as a switch with accessible label", () => {
    render(
      <Switch checked={false} onChange={jest.fn()}>
        Notifications push
      </Switch>,
    );

    const button = screen.getByRole("switch", { name: /Notifications push/i });
    expect(button).toBeInTheDocument();
    expect(button).toHaveAttribute("aria-checked", "false");
  });

  it("reflects checked state and toggles on click", () => {
    const onChange = jest.fn();
    const { rerender } = render(
      <Switch checked={false} onChange={onChange}>
        Dark mode
      </Switch>,
    );

    const button = screen.getByRole("switch", { name: /Dark mode/i });
    fireEvent.click(button);
    expect(onChange).toHaveBeenCalledTimes(1);

    rerender(
      <Switch checked={true} onChange={onChange}>
        Dark mode
      </Switch>,
    );
    expect(button).toHaveAttribute("aria-checked", "true");
  });

  it("is disabled when disabled prop is true", () => {
    render(
      <Switch checked={false} onChange={jest.fn()} disabled>
        Off
      </Switch>,
    );

    expect(screen.getByRole("switch")).toBeDisabled();
  });
});
