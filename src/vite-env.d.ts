/// <reference types="vite/client" />
/// <reference types="vite-plugin-pwa/client" />

declare module "*.css?url" {
  const href: string
  export default href
}
