describe("sanity", () => {
  it("runs in headless node + jest environment", () => {
    expect(1 + 1).toBe(2);
  });
});
