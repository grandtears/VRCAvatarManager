import { useEffect, useState } from "react";

export default function App() {
    const [avatars, setAvatars] = useState([]);

    useEffect(() => {
        fetch("http://localhost:8787/avatars")
            .then((r) => r.json())
            .then(setAvatars);
    }, []);

    return (
        <div style={{ padding: 16 }}>
            <h1>My VRChat Avatars</h1>

            <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12 }}>
                {avatars.map((a: any) => (
                    <div key={a.id}>
                        <img src={a.thumbnail} width={200} />
                        <div>{a.name}</div>
                        <small>{a.platform}</small>
                    </div>
                ))}
            </div>
        </div>
    );
}
