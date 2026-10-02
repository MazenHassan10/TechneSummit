import { expect, test } from "bun:test";
import { cleanSocialUrl, socialType } from "./social";
test("recognises social networks, rejects websites", () => {
  expect(socialType("https://www.linkedin.com/in/nour-el-shaeri-010bb8142/?isSelfProfile=false")).toBe("linkedin");
  expect(socialType("eg.linkedin.com/in/ahmadwadi")).toBe("linkedin");
  expect(socialType("https://x.com/nagaty")).toBe("x");
  expect(socialType("https://twitter.com/mghoneima")).toBe("x");
  expect(socialType("https://www.instagram.com/dr.sherifgamal/")).toBe("instagram");
  expect(socialType("https://www.facebook.com/someone")).toBe("facebook");
  expect(socialType("https://www.linkedin.com/company/techne")).toBeNull(); // company page, not a person
  expect(socialType("https://tactful.ai")).toBeNull();
});
test("cleans links", () => {
  expect(cleanSocialUrl("https://www.linkedin.com/in/nour-el-shaeri-010bb8142/?isSelfProfile=false")).toBe("https://www.linkedin.com/in/nour-el-shaeri-010bb8142/");
  expect(cleanSocialUrl("eg.linkedin.com/in/ahmadwadi")).toBe("https://www.linkedin.com/in/ahmadwadi");
  expect(cleanSocialUrl("http://instagram.com/dr.sherifgamal?igsh=abc")).toBe("https://www.instagram.com/dr.sherifgamal");
  expect(cleanSocialUrl("https://m.facebook.com/someone")).toBe("https://facebook.com/someone");
});
