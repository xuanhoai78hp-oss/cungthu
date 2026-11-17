# Game Cung Thủ

Game chiến thuật thủ thành với góc nhìn thứ nhất. Người chơi điều khiển cung bằng gyro: ngắm lên xuống và xoay trái phải để phòng thủ.

Ảnh tham khảo [cung.png](./cung.png) gồm 3 động tác bắn cung và giao diện game.

## Côn trùng địch

Ảnh [cungthu.png](./cungthu.png) chứa 4 loại côn trùng. Ở hàng 2, các ô 1-4 là côn trùng mẹ biết bay; cần vẽ thêm cánh cho chúng. Các ô 5-8 là côn trùng con do mẹ sinh ra. Chúng rơi từ vị trí của mẹ, bò theo đường ziczac về phía cửa thành;Khi côn trùng bò sang trái, lật ngang hình để chúng quay đúng hướng. Ban đầu, mỗi mẹ sinh 2 con; sau khi 2 con bị bắn hạ, mẹ sinh tiếp 3 con. Côn trùng mẹ có kích thước gấp 4 lần côn trùng con.
 người chơi phải bắn hạ chúng trước khi tới nơi.

Ở hàng 3, các ô 1-4 là côn trùng mẹ biết bò, còn các ô 5-8 là côn trùng con. Khi côn trùng bò sang trái, lật ngang hình để chúng quay đúng hướng. Ban đầu, mỗi mẹ sinh 2 con; sau khi 2 con bị bắn hạ, mẹ sinh tiếp 3 con. Côn trùng mẹ có kích thước gấp 4 lần côn trùng con.

## Chạy bản chơi thử

Cài đặt dependencies rồi chạy máy chủ phát triển:

```sh
npm install
npm run dev
```

Mở địa chỉ Vite in ra để chơi. Kéo chuột hoặc vuốt màn hình (hoặc dùng phím mũi tên/WASD) để ngắm, nhấn **BẮN** hoặc **Space** để bắn tên sét. Trên thiết bị hỗ trợ, nhấn **BẬT GYRO** để ngắm bằng cách nghiêng/xoay thiết bị; có thể đặt lại tâm gyro bằng nút tương ứng. Âm thanh bắn và trúng mục tiêu được tạo bằng Web Audio API.

Bản thử nghiệm dựng map 3D với cây cổ thụ lớn và cổng thành; côn trùng mẹ bay/bò sinh con, con rơi xuống rồi bò ziczac về cổng. Bắn trúng tạo hiệu ứng nổ như pháo hoa.