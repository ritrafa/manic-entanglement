'use client';

import React from 'react';
import { createPortal } from 'react-dom';

interface NftModalProps {
    /** The dialog's accessible name. */
    label: string;
    children: React.ReactNode;
}

/** The mint and save panels as a pop-up over the whole page: portalled to
 *  <body> so the narrow HUD wallet column never squeezes them. React context
 *  (the wallet provider) still reaches the panel through the portal. The
 *  panel's own buttons close it; the backdrop does not, so a mint or save in
 *  flight is never dismissed by a stray tap. */
const NftModal: React.FC<NftModalProps> = ({ label, children }) => {
    if (typeof document === 'undefined') return null;
    return createPortal(
        <div className="nft-modal-scrim">
            <div className="nft-modal" role="dialog" aria-modal="true" aria-label={label}>
                {children}
            </div>
        </div>,
        document.body,
    );
};

export default NftModal;
