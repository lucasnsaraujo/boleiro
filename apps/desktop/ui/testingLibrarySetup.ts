import { configure } from "@testing-library/react";

// findBy and waitFor wait 1 s by default, which a screen fed by the engine can take on CI's 2-core runner.
configure({ asyncUtilTimeout: 5_000 });
