import { cn } from '@/lib/utils';

type HeaderProps = React.ComponentPropsWithoutRef<'header'> & {
  /** Classes applied to the centered inner content wrapper (e.g. to narrow it on desktop). */
  innerClassName?: string;
};

function Header({ children, className, innerClassName, ...props }: HeaderProps) {
  return (
    <header
      className={cn('sticky top-0 z-5 bg-background/15 backdrop-blur', className)}
      {...props}
    >
      <div
        className={cn(
          'mx-auto flex w-full max-w-5xl items-center justify-between px-3 py-3 lg:px-8',
          innerClassName,
        )}
      >
        {children}
      </div>
    </header>
  );
}

export default Header;
