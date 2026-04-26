import ContactSection from "@/components/ContactSection";
import Container from "@/components/Container";
import Cultures from "@/components/Cultures";
import PageIntro from "@/components/PageIntro";
import { StatList, StatListItem } from "@/components/StatList";
import React from "react";

const ContactPage = () => {
  return (
    <>
      <PageIntro eyebrow="Về chúng tôi" title="XưởngArt – Kể chuyện bằng hình ảnh chuyển động">
        <p>
          Chúng tôi là studio sáng tạo chuyên về sản xuất video và nội dung hình
          ảnh. Mục tiêu của XưởngArt là giúp thương hiệu kể được câu chuyện của
          mình một cách giàu cảm xúc, hiện đại và hiệu quả.
        </p>
        <div className="mt-10 max-w-2xl space-y-6 text-base">
          <p>
            Từ quảng cáo, MV, social video đến ghi hình sự kiện, mỗi dự án đều
            được thực hiện theo quy trình chuẩn điện ảnh: tiền kỳ kỹ lưỡng, sản
            xuất gọn gàng và hậu kỳ tỉ mỉ.
          </p>
          <p>
            Chúng tôi tin rằng Every frame tells a story – mỗi khung hình đều có
            sức mạnh khơi gợi cảm xúc và truyền tải thông điệp rõ ràng.
          </p>
        </div>
      </PageIntro>
      <Container className="mt-16">
        <StatList>
          <StatListItem value="50+" label="Dự án đã thực hiện" />
          <StatListItem value="20+" label="Thương hiệu đồng hành" />
          <StatListItem value="5+ năm" label="Kinh nghiệm đội ngũ" />
        </StatList>
      </Container>
      <Cultures />
      <ContactSection />
    </>
  );
};

export default ContactPage;
