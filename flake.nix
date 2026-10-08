{
  description = "opengrips: OpenSCAD and Python tools to build and check the parts";

  inputs.nixpkgs.url = "github:NixOS/nixpkgs/nixpkgs-unstable";

  outputs = { self, nixpkgs }:
    let
      systems = [ "x86_64-linux" "aarch64-linux" "x86_64-darwin" "aarch64-darwin" ];
      forAllSystems = f: nixpkgs.lib.genAttrs systems (system: f nixpkgs.legacyPackages.${system});
    in {
      devShells = forAllSystems (pkgs: {
        default = pkgs.mkShell {
          packages = [
            pkgs.gnumake
            pkgs.openscad
            (pkgs.python3.withPackages (ps: with ps; [ trimesh manifold3d numpy networkx lxml scipy rtree pillow ]))
          ] ++ pkgs.lib.optional pkgs.stdenv.isLinux pkgs.xvfb-run;
        };
      });
    };
}
