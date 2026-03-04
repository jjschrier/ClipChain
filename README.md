<<<<<<< Updated upstream
🎥 ClipChain: Tokenized Attention Economy

ClipChain is a Web3 video delivery platform built to align incentives between creators and their audiences. By leveraging the Solana blockchain, the platform transforms passive viewership into active participation, allowing fans to earn creator-specific tokens through engagement and verifiable watch-time.

🚀 The Concept
Traditional content platforms capture the majority of advertising value, leaving viewers with zero stake in the ecosystems they support. ClipChain decentralizes this value by:
Tokenizing Attention: Using ad-revenue logic to buy creator tokens from the open market.
Proof-of-Engagement: Distributing tokens back to fans based on real-time engagement metrics.
Direct Community Ownership: Aligning a creator’s audience growth with the value of their unique token.

🛠️ Technical Stack & Architecture

Core Infrastructure
Framework: Next.js / React (Modern, high-performance UI)
Database: Firebase (Real-time metadata and user state management)
Video Delivery: Integrated with UploadThing for scalable, secure content hosting.

Web3 & Blockchain
Network: Built on Solana for sub-second transaction speeds and near-zero fees.
Wallet Integration: Support for Phantom, Solflare, and Backpack via Solana Wallet Adapter.
Reward Logic: Custom backend algorithms for calculating watch_time × loyalty_multiplier.

🔧 System Features
Creator Dashboard: Centralized hub for managing Mint Addresses, Daily Mint Caps, and Reward Rates.
Identity & Access Management (IAM): Multi-tier subscription paths (Basic → Pro → Boosted) with specific permission sets.
Cryptographic Security: Secure handling of public keys and transaction signing.
Safe Mode Content Policy: Logic-based toggle for age-verification and sensitive content filtering.

🧪 Educational Intent
This project serves as my primary technical sandbox while pursuing a Computer Science degree and Cisco Networking Academy certifications. It demonstrates my competency in:
API Integration & Security
State Management & Database Architecture
Network Data Handling
Systems Administration & Automated Logic

📸 Project Showcase
<img width="1209" height="1192" alt="image" src="https://github.com/user-attachments/assets/38a49b0d-45b6-4d6b-9130-38e3bcfb8b63" />
=======
# ClipChain

ClipChain is a decentralized video platform where content creators:

- Upload videos to Firebase Storage
- Are automatically assigned a unique Solana SPL Token
- Can reward fans with that token based on video watch time
- All interactions are stored in Firestore
- Wallet authentication via Solana adapter (e.g., Phantom)
- Fans earn yield in real-time via watch hooks

## Key Files:
- `App.tsx` - Entry point
- `Dashboard.tsx` - Main creator dashboard
- `UploadVideo.tsx` - Upload and trigger airdrop
- `lib/solana.ts` - Token logic (mint, airdrop)
- `lib/hooks/useViewerWatch.ts` - Tracks live view duration
- `firebase.ts` - Firebase app and Firestore setup
>>>>>>> Stashed changes
