import React, { useState } from 'react';
import handleGenerateGIF from '../lib/player_generator';
import GameState from '../lib/GameState';

interface NFTCreatorProps {
    gameState: GameState;
}

const NFTCreator: React.FC<NFTCreatorProps> = ({ gameState }) => {
    const [isLoading, setIsLoading] = useState(false);
    const [result, setResult] = useState<any>(null);

    const handleSubmit = async (event: React.FormEvent) => {
        event.preventDefault();
        setIsLoading(true);

        try {
            const selectedTraits = {
                Head: gameState.player.head,
                Body: gameState.player.body,
                Eye: gameState.player.eye,
                Back: gameState.player.back,
                Clothes: gameState.player.clothes,
            };

            // Generate GIF
            const gifUrl = await handleGenerateGIF(selectedTraits);
            
            // Convert GIF to blob
            const response = await fetch(gifUrl);
            const blob = await response.blob();
            
            // Convert blob to base64
            const reader = new FileReader();
            reader.readAsDataURL(blob);
            reader.onloadend = async () => {
                const base64data = reader.result as string;
                
                // Send to API using fetch
                const apiResponse = await fetch('/api/create-nft', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({
                        gifBlob: base64data,
                        selectedTraits
                    }),
                });


                if (!apiResponse.ok) {
                    const errorText = await apiResponse.text();
                    console.error('API Error Response:', errorText);
                    throw new Error(`HTTP error! status: ${apiResponse.status}, message: ${errorText}`);
                }

                const result = await apiResponse.json();
                if (result.error) {
                    throw new Error(result.error);
                }
                setResult(result);
            };
        } catch (error) {
            console.error('Error creating NFT:', error);
            setResult({ error: error instanceof Error ? error.message : 'Failed to create NFT' });
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div>
            <form onSubmit={handleSubmit}>
                <button type="submit" disabled={isLoading && true} className="wallet-actions">
                    {isLoading ? 'Creating NFT...' : '🌿 Mint'}
                </button>
            </form>
        </div>
    );
};

export default NFTCreator;