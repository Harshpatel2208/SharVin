import React, { useEffect, useRef } from 'react';

/**
 * Shared "dismiss on outside click" behaviour so every pop-up in the app
 * (dropdowns, modal dialogs, drawers) closes the same way.
 */

const backdropClass =
  'fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm';

interface ModalBackdropProps {
  onClose: () => void;
  className?: string;
  style?: React.CSSProperties;
  role?: string;
  'aria-modal'?: boolean;
  'aria-label'?: string;
  children: React.ReactNode;
}

/**
 * Full-screen modal backdrop. Clicking (or dragging a text selection) outside the
 * dialog closes it; clicks inside the dialog body never leak to the backdrop.
 */
export const ModalBackdrop: React.FC<ModalBackdropProps> = ({
  onClose,
  className = backdropClass,
  style,
  role,
  'aria-modal': ariaModal,
  'aria-label': ariaLabel,
  children,
}) => {
  const backdropRef = useRef<HTMLDivElement>(null);
  const pointerStartedOnBackdrop = useRef(false);

  // A drag (text selection) that starts inside the dialog and ends on the backdrop still
  // fires a click on the backdrop, which would close the modal by accident. Only treat the
  // click as an outside click when the press itself began on empty backdrop.
  useEffect(() => {
    const node = backdropRef.current;
    if (!node) return;
    const trackPointerDown = (event: MouseEvent | TouchEvent) => {
      pointerStartedOnBackdrop.current = event.target === node;
    };
    node.addEventListener('mousedown', trackPointerDown, true);
    node.addEventListener('touchstart', trackPointerDown, true);
    return () => {
      node.removeEventListener('mousedown', trackPointerDown, true);
      node.removeEventListener('touchstart', trackPointerDown, true);
    };
  }, []);

  const handleBackdropClick = (event: React.MouseEvent<HTMLDivElement>) => {
    if (event.target !== backdropRef.current) return;
    if (!pointerStartedOnBackdrop.current) return;
    pointerStartedOnBackdrop.current = false;
    onClose();
  };

  return (
    <div
      ref={backdropRef}
      onClick={handleBackdropClick}
      className={className}
      style={{ cursor: 'default', ...style }}
      role={role}
      aria-modal={ariaModal}
      aria-label={ariaLabel}
    >
      {children}
    </div>
  );
};

interface DismissOnOutsideClickProps {
  onClose: () => void;
  className?: string;
  children: React.ReactNode;
}

/**
 * Wrapper for a dropdown / popover panel together with the control that opens it. Any click
 * (or touch) landing outside the panel dismisses it — including a click on that control, so
 * the control only has to set the open state to true and can never double-toggle.
 */
export const DismissOnOutsideClick: React.FC<DismissOnOutsideClickProps> = ({
  onClose,
  className,
  children,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handlePointerDown = (event: MouseEvent | TouchEvent) => {
      const target = event.target as Node | null;
      if (!target) return;
      if (containerRef.current?.contains(target)) return;
      onClose();
    };
    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('touchstart', handlePointerDown);
    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('touchstart', handlePointerDown);
    };
  }, [onClose]);

  return (
    <div ref={containerRef} className={className}>
      {children}
    </div>
  );
};
