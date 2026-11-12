import next from "eslint-config-next/core-web-vitals";

const eslintConfig = [
    {
        ignores: [".next/**", "node_modules/**", "public/**", "next-env.d.ts"],
    },
    ...next,
    {
        rules: {
            // The game draws pixel-art sprites and tiles with plain <img> on
            // purpose: no optimization, no layout shift handling wanted.
            "@next/next/no-img-element": "off",
        },
    },
];

export default eslintConfig;
