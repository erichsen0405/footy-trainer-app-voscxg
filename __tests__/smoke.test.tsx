import React from "react";
import { Text } from "react-native";
import { render, screen } from "@testing-library/react-native";

describe("test foundation smoke", () => {
  it("renders text with RN Testing Library", () => {
    render(<Text accessibilityRole="header">Test baseline ready</Text>);

    expect(screen.getByRole("header")).toHaveTextContent("Test baseline ready");
  });
});
