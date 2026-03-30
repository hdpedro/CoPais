import "@testing-library/jest-dom/vitest";
import { beforeAll, afterEach, afterAll } from "vitest";
import { server } from "./mocks/server";

// Start MSW server before all tests
beforeAll(() => server.listen({ onUnhandledRequest: "bypass" }));

// Reset handlers between tests so one test doesn't affect another
afterEach(() => server.resetHandlers());

// Clean up after all tests are done
afterAll(() => server.close());
