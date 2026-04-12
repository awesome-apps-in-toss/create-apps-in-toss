declare module 'virtual:apps' {
  export interface AppPackage {
    folderName: string;
    name: string;
    version: string;
    description: string;
    scripts: Record<string, string>;
    dependencies: Record<string, string>;
    devDependencies: Record<string, string>;
  }

  const apps: AppPackage[];
  export default apps;
}
