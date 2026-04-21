import Image from "next/image";

interface AppLogoProps {
  className?: string;
  priority?: boolean;
}

export function AppLogo({ className, priority = false }: AppLogoProps) {
  return (
    <Image
      alt="Logo do aplicativo"
      className={className}
      height={879}
      priority={priority}
      src="/logo-sol.jpeg"
      width={520}
    />
  );
}
