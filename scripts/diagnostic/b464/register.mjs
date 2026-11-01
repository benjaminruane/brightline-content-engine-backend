import { register } from "node:module";
import { pathToFileURL } from "node:url";

register("./raw-hook.mjs", import.meta.url);
