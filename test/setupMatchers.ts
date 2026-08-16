/**
 * `toHaveTextContent` / `toBeInTheDocument`, for the component suites.
 *
 * Loaded for EVERY suite, including the node-environment ones, and that is safe: this package only
 * extends `expect`, and its matchers reach for a DOM when they are CALLED, never when they are
 * registered. The alternative — a second jest project just to scope a setup file — would split the
 * one command the quality gate runs into two.
 */
import '@testing-library/jest-dom';
