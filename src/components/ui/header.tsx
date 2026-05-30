import { cn } from '@/lib/utils';

function Header({ children, className, ...props }: React.ComponentPropsWithoutRef<'header'>) {
  return (
    <header
      className={cn(
        'sticky top-0 z-5 flex items-center justify-between bg-background/15 px-3 py-3 backdrop-blur',
        className,
      )}
      {...props}
    >
      {children}
    </header>
  );
}

export default Header;
